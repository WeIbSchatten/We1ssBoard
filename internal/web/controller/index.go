package controller

import (
	"fmt"
	"net/http"
	"strings"
	"text/template"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/logger"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/loginlimit"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/clientip"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/middleware"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/panel"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/tgbot"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

var defaultLoginLimiter = loginlimit.New(loginlimit.MaxFailures, loginlimit.Window, loginlimit.Cooldown)

// LoginForm represents the login request structure.
type LoginForm struct {
	Username      string `json:"username" form:"username"`
	Password      string `json:"password" form:"password"`
	TwoFactorCode string `json:"twoFactorCode" form:"twoFactorCode"`
}

// IndexController handles the main index and login-related routes.
type IndexController struct {
	BaseController

	settingService service.SettingService
	userService    panel.UserService
	tgbot          tgbot.Tgbot
}

// NewIndexController creates a new IndexController and initializes its routes.
func NewIndexController(g *gin.RouterGroup) *IndexController {
	a := &IndexController{}
	a.initRouter(g)
	return a
}

// initRouter sets up the routes for index, login, logout, and two-factor authentication.
func (a *IndexController) initRouter(g *gin.RouterGroup) {
	g.GET("/", a.index)
	g.GET("/csrf-token", a.csrfToken)
	g.GET("/"+customLoginCssPath, a.customLoginCss)

	g.POST("/login", middleware.CSRFMiddleware(), a.login)
	g.POST("/login/ticket", middleware.CSRFMiddleware(), a.loginWithTicket)
	g.POST("/logout", middleware.CSRFMiddleware(), a.logout)
	g.POST("/getTwoFactorEnable", middleware.CSRFMiddleware(), a.getTwoFactorEnable)
	// Public one-shot enroll consume (no CSRF: master panels call this server-to-server).
	g.POST("/enroll/consume", a.enrollConsume)
}

// customLoginCss is public: the login page needs it before authentication.
func (a *IndexController) customLoginCss(c *gin.Context) {
	serveCustomCss(c, "login.html")
}

// index handles the root route, redirecting logged-in users to the panel or showing the login page.
func (a *IndexController) index(c *gin.Context) {
	if session.IsLogin(c) {
		c.Header("Cache-Control", "no-store")
		c.Redirect(http.StatusTemporaryRedirect, c.GetString("base_path")+"panel/")
		return
	}
	serveDistPage(c, "login.html")
}

// login handles user authentication and session creation.
func (a *IndexController) login(c *gin.Context) {
	var form LoginForm

	if err := c.ShouldBind(&form); err != nil {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.invalidFormData"))
		return
	}
	if form.Username == "" {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.emptyUsername"))
		return
	}
	if form.Password == "" {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.emptyPassword"))
		return
	}

	remoteIP := clientip.RemoteIP(c)
	safeUser := template.HTMLEscapeString(form.Username)
	timeStr := time.Now().Format("2006-01-02 15:04:05")
	if blockedUntil, ok := defaultLoginLimiter.Allow(remoteIP, form.Username); !ok {
		reason := "too many failed attempts"
		logger.Warningf("failed login: username=%q, IP=%q, reason=%q, blocked_until=%s", form.Username, remoteIP, reason, blockedUntil.Format(time.RFC3339))
		a.tgbot.UserLoginNotify(tgbot.LoginAttempt{
			Username: safeUser,
			IP:       remoteIP,
			Time:     timeStr,
			Status:   tgbot.LoginFail,
			Reason:   reason,
		})
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.wrongUsernameOrPassword"))
		return
	}

	user, checkErr := a.userService.CheckUser(form.Username, form.Password, form.TwoFactorCode)

	if user == nil {
		reason := loginFailureReason(checkErr)
		if blockedUntil, blocked := defaultLoginLimiter.RegisterFailure(remoteIP, form.Username); blocked {
			logger.Warningf("failed login: username=%q, IP=%q, reason=%q, blocked_until=%s", form.Username, remoteIP, reason, blockedUntil.Format(time.RFC3339))
		} else {
			logger.Warningf("failed login: username=%q, IP=%q, reason=%q", form.Username, remoteIP, reason)
		}
		a.tgbot.UserLoginNotify(tgbot.LoginAttempt{
			Username: safeUser,
			IP:       remoteIP,
			Time:     timeStr,
			Status:   tgbot.LoginFail,
			Reason:   reason,
		})
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.wrongUsernameOrPassword"))
		return
	}

	defaultLoginLimiter.RegisterSuccess(remoteIP, form.Username)
	logger.Infof("logged in successfully: username=%q, IP=%q", form.Username, remoteIP)
	a.tgbot.UserLoginNotify(tgbot.LoginAttempt{
		Username: safeUser,
		IP:       remoteIP,
		Time:     timeStr,
		Status:   tgbot.LoginSuccess,
	})

	if err := session.SetLoginUser(c, user); err != nil {
		logger.Warning("Unable to save session:", err)
		return
	}

	jsonMsg(c, I18nWeb(c, "pages.login.toasts.successLogin"), nil)
}

// loginTicketForm carries the one-time ticket a managing master obtained from
// this panel's admin API (see SettingController.issueLoginTicket).
type loginTicketForm struct {
	Ticket string `json:"ticket" form:"ticket"`
}

// loginTicketLimiterUser keys ticket guesses apart from password guesses so a
// ticket flood cannot lock the admin out of the password form.
const loginTicketLimiterUser = "login-ticket"

// loginWithTicket signs the browser in as the panel admin by redeeming a ticket
// minted for an admin API token. It skips the password and 2FA prompts on purpose:
// the master already proved admin authority, and the ticket is single-use.
func (a *IndexController) loginWithTicket(c *gin.Context) {
	var form loginTicketForm
	if err := c.ShouldBind(&form); err != nil {
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.invalidFormData"))
		return
	}
	remoteIP := clientip.RemoteIP(c)
	invalid := func(reason string) {
		logger.Warningf("failed ticket login: IP=%q, reason=%q", remoteIP, reason)
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.invalidLoginTicket"))
	}
	if _, ok := defaultLoginLimiter.Allow(remoteIP, loginTicketLimiterUser); !ok {
		invalid("too many failed attempts")
		return
	}
	if !session.ConsumeLoginTicket(form.Ticket) {
		defaultLoginLimiter.RegisterFailure(remoteIP, loginTicketLimiterUser)
		invalid("unknown or expired ticket")
		return
	}
	user, err := a.userService.GetFirstUser()
	if err != nil || user == nil {
		logger.Warning("ticket login: no admin user:", err)
		pureJsonMsg(c, http.StatusOK, false, I18nWeb(c, "pages.login.toasts.invalidLoginTicket"))
		return
	}
	defaultLoginLimiter.RegisterSuccess(remoteIP, loginTicketLimiterUser)
	logger.Infof("logged in via login ticket: username=%q, IP=%q", user.Username, remoteIP)
	a.tgbot.UserLoginNotify(tgbot.LoginAttempt{
		Username: template.HTMLEscapeString(user.Username),
		IP:       remoteIP,
		Time:     time.Now().Format("2006-01-02 15:04:05"),
		Status:   tgbot.LoginSuccess,
	})
	if err := session.SetLoginUser(c, user); err != nil {
		logger.Warning("Unable to save session:", err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.login.toasts.successLogin"), nil)
}

func loginFailureReason(err error) string {
	if err != nil && err.Error() == "invalid 2fa code" {
		return "invalid 2FA code"
	}
	return "invalid credentials"
}

type enrollConsumeForm struct {
	Code string `json:"code" form:"code"`
}

func (a *IndexController) enrollConsume(c *gin.Context) {
	form := &enrollConsumeForm{}
	if err := c.ShouldBindJSON(form); err != nil || strings.TrimSpace(form.Code) == "" {
		pureJsonMsg(c, http.StatusOK, false, "code is required")
		return
	}
	preferredBase, err := a.settingService.ConsumeEnrollInviteCode(form.Code)
	if err != nil {
		logger.Warningf("enroll consume failed: IP=%q err=%v", clientip.RemoteIP(c), err)
		pureJsonMsg(c, http.StatusOK, false, err.Error())
		return
	}
	tokSvc := &panel.ApiTokenService{}
	view, err := tokSvc.Create(fmt.Sprintf("enroll-%d", time.Now().Unix()), model.ApiScopeAdmin, 0)
	if err != nil {
		logger.Warningf("enroll token mint failed: IP=%q err=%v", clientip.RemoteIP(c), err)
		pureJsonMsg(c, http.StatusOK, false, err.Error())
		return
	}
	res, err := a.settingService.EnrollConnectionDetails(view.Token, preferredBase)
	if err != nil {
		logger.Warningf("enroll details failed: IP=%q err=%v", clientip.RemoteIP(c), err)
		pureJsonMsg(c, http.StatusOK, false, err.Error())
		return
	}
	c.Header("Cache-Control", "no-store")
	jsonObj(c, res, nil)
}

func (a *IndexController) logout(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user != nil {
		logger.Infof("logged out successfully: username=%q", user.Username)
	}
	if err := session.ClearSession(c); err != nil {
		logger.Warning("Unable to clear session on logout:", err)
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// csrfToken returns the session CSRF token. Public — the login page
// needs a token before authenticating.
func (a *IndexController) csrfToken(c *gin.Context) {
	token, err := session.EnsureCSRFToken(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "obj": token})
}

// getTwoFactorEnable retrieves the current status of two-factor authentication.
func (a *IndexController) getTwoFactorEnable(c *gin.Context) {
	status, err := a.settingService.GetTwoFactorEnable()
	jsonObj(c, status, err)
}
