package sub

import (
	"bytes"
	"encoding/json"
	"errors"
	"io/fs"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/logger"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/loginlimit"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/clientip"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/portal"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/session"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/xray"
)

const (
	portalPath          = "/portal"
	portalSessionName   = "We1ssBoardPortal"
	portalSessionMaxAge = 7 * 24 * 3600
	sessClientKey       = "portalClientId"
	sessEpochKey        = "portalEpoch"
	ctxClientKey        = "portalClient"
	ctxTokenKey         = "portalTokenId"
	maxDeviceNameLength = 64
)

// PortalController serves the client portal API on the subscription server.
type PortalController struct {
	sub      *SUBController
	svc      *portal.Service
	settings *service.SettingService
	limiter  *loginlimit.Limiter
	readPage func() ([]byte, error)
}

// PortalProfile is what GET /portal/api/me returns.
type PortalProfile struct {
	Email      string           `json:"email"`
	Enable     bool             `json:"enable"`
	ExpiryTime int64            `json:"expiryTime"`
	TotalGB    int64            `json:"totalGB"`
	Up         int64            `json:"up"`
	Down       int64            `json:"down"`
	Group      string           `json:"group"`
	SubURL     string           `json:"subUrl"`
	MustChange bool             `json:"mustChange"`
	LDAP       bool             `json:"ldap"`
	Keys       []portal.KeyInfo `json:"keys"`
	Devices    []portal.Device  `json:"devices"`
	CSRFToken  string           `json:"csrfToken,omitempty"`
}

func NewPortalController(g *gin.RouterGroup, sub *SUBController, svc *portal.Service, settings *service.SettingService) *PortalController {
	a := &PortalController{sub: sub, svc: svc, settings: settings, limiter: loginlimit.New(loginlimit.MaxFailures, loginlimit.Window, loginlimit.Cooldown)}
	secret, err := settings.GetPortalSecret()
	if err != nil {
		logger.Warning("portal: session secret:", err)
	}
	store := cookie.NewStore(secret)
	store.Options(sessions.Options{Path: "/portal", MaxAge: portalSessionMaxAge, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	g.Use(a.requireEnabled, sessions.Sessions(portalSessionName, store))
	a.readPage = readPortalPage
	g.GET("", a.page)
	g.GET("/", a.page)

	api := g.Group("/api")
	api.POST("/login", a.login)
	authed := api.Group("", a.authenticate)
	authed.POST("/logout", a.logout)
	authed.POST("/password", a.requireCSRF, a.changePassword)
	gated := authed.Group("", a.requirePasswordChanged)
	gated.GET("/me", a.me)
	gated.GET("/sub", a.subscription)
	writable := gated.Group("", a.requireCSRF, a.requireActiveClient)
	writable.PUT("/hidden", a.replaceHidden)
	writable.DELETE("/devices/:id", a.revokeDevice)
	return a
}

func portalError(c *gin.Context, status int, code string) {
	c.AbortWithStatusJSON(status, gin.H{"error": code})
}

func (a *PortalController) requireEnabled(c *gin.Context) {
	if on, err := a.settings.GetPortalEnabled(); err != nil || !on {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	c.Next()
}

func (a *PortalController) login(c *gin.Context) {
	var req struct {
		Login    string `json:"login"`
		Password string `json:"password"`
		Client   string `json:"client"`
		Device   string `json:"device"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (req.Client != "web" && req.Client != "app") {
		portalError(c, http.StatusBadRequest, "bad_request")
		return
	}
	if req.Client == "app" && (strings.TrimSpace(req.Device) == "" || len(req.Device) > maxDeviceNameLength) {
		portalError(c, http.StatusBadRequest, "bad_device")
		return
	}
	ip := clientip.RemoteIP(c)
	if until, ok := a.limiter.Allow(ip, req.Login); !ok {
		c.Header("Retry-After", strconv.Itoa(int(math.Ceil(time.Until(until).Seconds()))))
		portalError(c, http.StatusTooManyRequests, "too_many_attempts")
		return
	}
	rec, _, err := a.svc.Authenticate(req.Login, req.Password)
	if err != nil {
		a.limiter.RegisterFailure(ip, req.Login)
		portalError(c, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	a.limiter.RegisterSuccess(ip, req.Login)

	if req.Client == "app" {
		if rec.PortalMustChange {
			portalError(c, http.StatusForbidden, "must_change_password")
			return
		}
		token, err := a.svc.IssueToken(rec.Id, strings.TrimSpace(req.Device))
		if err != nil {
			portalError(c, http.StatusInternalServerError, "internal")
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": token})
		return
	}
	if err := a.startSession(c, rec.Id, rec.PortalSessionEpoch); err != nil {
		portalError(c, http.StatusInternalServerError, "internal")
		return
	}
	csrf, err := session.EnsureCSRFToken(c)
	if err != nil {
		portalError(c, http.StatusInternalServerError, "internal")
		return
	}
	c.JSON(http.StatusOK, gin.H{"mustChange": rec.PortalMustChange, "csrfToken": csrf})
}

// startSession binds the session to the client and epoch; the CSRF token is kept.
func (a *PortalController) startSession(c *gin.Context, clientID int, epoch int64) error {
	s := sessions.Default(c)
	s.Options(sessions.Options{Path: "/portal", MaxAge: portalSessionMaxAge, HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: c.Request.TLS != nil})
	s.Set(sessClientKey, clientID)
	s.Set(sessEpochKey, epoch)
	return s.Save()
}

// authenticate accepts a device token (Bearer) or a portal web session whose epoch is current.
func (a *PortalController) authenticate(c *gin.Context) {
	if auth := c.GetHeader("Authorization"); auth != "" {
		token, ok := strings.CutPrefix(auth, "Bearer ")
		if !ok {
			portalError(c, http.StatusUnauthorized, "unauthorized")
			return
		}
		rec, tokenID, err := a.svc.ClientByToken(strings.TrimSpace(token))
		if err != nil {
			portalError(c, http.StatusUnauthorized, "unauthorized")
			return
		}
		c.Set(ctxClientKey, rec)
		c.Set(ctxTokenKey, tokenID)
		c.Next()
		return
	}
	s := sessions.Default(c)
	clientID, ok1 := s.Get(sessClientKey).(int)
	epoch, ok2 := s.Get(sessEpochKey).(int64)
	if !ok1 || !ok2 {
		portalError(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	var rec model.ClientRecord
	if err := database.GetDB().Where("id = ?", clientID).Limit(1).Find(&rec).Error; err != nil || rec.Id == 0 || rec.PortalSessionEpoch != epoch {
		portalError(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	c.Set(ctxClientKey, &rec)
	c.Next()
}

func portalClient(c *gin.Context) *model.ClientRecord {
	return c.MustGet(ctxClientKey).(*model.ClientRecord)
}

func isBearer(c *gin.Context) bool {
	_, ok := c.Get(ctxTokenKey)
	return ok
}

// requireCSRF guards cookie-authenticated writes; a Bearer token is not sent by browsers on its own.
func (a *PortalController) requireCSRF(c *gin.Context) {
	if !isBearer(c) && !session.ValidateCSRFToken(c) {
		portalError(c, http.StatusForbidden, "csrf")
		return
	}
	c.Next()
}

func (a *PortalController) requirePasswordChanged(c *gin.Context) {
	if portalClient(c).PortalMustChange {
		portalError(c, http.StatusForbidden, "must_change_password")
		return
	}
	c.Next()
}

func (a *PortalController) requireActiveClient(c *gin.Context) {
	rec := portalClient(c)
	expired := rec.ExpiryTime > 0 && rec.ExpiryTime <= time.Now().UnixMilli()
	if !rec.Enable || expired {
		portalError(c, http.StatusForbidden, "client_disabled")
		return
	}
	c.Next()
}

func (a *PortalController) logout(c *gin.Context) {
	rec := portalClient(c)
	if tokenID, ok := c.Get(ctxTokenKey); ok {
		if err := a.svc.RevokeDevice(rec.Id, tokenID.(int)); err != nil {
			portalError(c, http.StatusInternalServerError, "internal")
			return
		}
		c.Status(http.StatusNoContent)
		return
	}
	s := sessions.Default(c)
	s.Clear()
	s.Options(sessions.Options{Path: "/portal", MaxAge: -1})
	_ = s.Save()
	c.Status(http.StatusNoContent)
}

func (a *PortalController) changePassword(c *gin.Context) {
	var req struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		portalError(c, http.StatusBadRequest, "bad_request")
		return
	}
	rec := portalClient(c)
	epoch, err := a.svc.ChangePassword(rec.Id, req.Current, req.New)
	switch {
	case errors.Is(err, portal.ErrWeakPassword):
		portalError(c, http.StatusBadRequest, "weak_password")
		return
	case errors.Is(err, portal.ErrLDAPManaged):
		portalError(c, http.StatusBadRequest, "ldap_managed")
		return
	case errors.Is(err, portal.ErrInvalidCredentials):
		portalError(c, http.StatusBadRequest, "wrong_password")
		return
	case err != nil:
		portalError(c, http.StatusInternalServerError, "internal")
		return
	}
	if !isBearer(c) {
		if err := a.startSession(c, rec.Id, epoch); err != nil {
			portalError(c, http.StatusInternalServerError, "internal")
			return
		}
	}
	c.Status(http.StatusNoContent)
}

func (a *PortalController) me(c *gin.Context) {
	rec := portalClient(c)
	keys, err := a.svc.ClientKeys(rec.Id)
	if err != nil {
		portalError(c, http.StatusInternalServerError, "internal")
		return
	}
	devices, err := a.svc.ListDevices(rec.Id)
	if err != nil {
		portalError(c, http.StatusInternalServerError, "internal")
		return
	}
	var traffic xray.ClientTraffic
	database.GetDB().Where("email = ?", rec.Email).Limit(1).Find(&traffic)
	_, host, _, _ := a.sub.subService.ResolveRequest(c)
	subURL, _, _ := a.sub.subService.ForRequest(host).BuildURLs(a.sub.subPath, a.sub.subJsonPath, a.sub.subClashPath, rec.SubID)
	profile := PortalProfile{
		Email: rec.Email, Enable: rec.Enable, ExpiryTime: rec.ExpiryTime, TotalGB: rec.TotalGB,
		Up: traffic.Up, Down: traffic.Down, Group: rec.Group, SubURL: subURL,
		MustChange: rec.PortalMustChange, LDAP: rec.PortalPasswordHash == "", Keys: keys, Devices: devices,
	}
	if !isBearer(c) {
		profile.CSRFToken, _ = session.EnsureCSRFToken(c)
	}
	c.JSON(http.StatusOK, profile)
}

func (a *PortalController) replaceHidden(c *gin.Context) {
	var req struct {
		Keys []portal.Key `json:"keys"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		portalError(c, http.StatusBadRequest, "bad_request")
		return
	}
	err := a.svc.ReplaceHidden(portalClient(c).Id, req.Keys)
	switch {
	case errors.Is(err, portal.ErrForeignKey):
		portalError(c, http.StatusBadRequest, "foreign_key")
	case errors.Is(err, portal.ErrNothingVisible):
		portalError(c, http.StatusBadRequest, "nothing_visible")
	case err != nil:
		portalError(c, http.StatusInternalServerError, "internal")
	default:
		c.Status(http.StatusNoContent)
	}
}

func (a *PortalController) revokeDevice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		portalError(c, http.StatusBadRequest, "bad_request")
		return
	}
	if err := a.svc.RevokeDevice(portalClient(c).Id, id); errors.Is(err, portal.ErrInvalidToken) {
		portalError(c, http.StatusNotFound, "not_found")
		return
	} else if err != nil {
		portalError(c, http.StatusInternalServerError, "internal")
		return
	}
	c.Status(http.StatusNoContent)
}

// subscription serves the client's subscription to a device token, exactly as /sub, /json and /clash do.
func (a *PortalController) subscription(c *gin.Context) {
	if !isBearer(c) {
		portalError(c, http.StatusUnauthorized, "unauthorized")
		return
	}
	rec := portalClient(c)
	if rec.SubID == "" {
		portalError(c, http.StatusNotFound, "no_subscription")
		return
	}
	format := c.DefaultQuery("format", "raw")
	if (format == "json" && !a.sub.jsonEnabled) || (format == "clash" && !a.sub.clashEnabled) {
		portalError(c, http.StatusNotFound, "format_disabled")
		return
	}
	if format != "raw" && format != "json" && format != "clash" {
		portalError(c, http.StatusBadRequest, "bad_format")
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "subid", Value: rec.SubID})
	if !a.sub.enforceHwid(c) {
		return
	}
	switch format {
	case "raw":
		a.sub.serveRawBody(c)
	case "json":
		a.sub.serveJson(c, a.sub.jsonAlwaysArray, "text/plain; charset=utf-8")
	case "clash":
		if !a.sub.serveClashBody(c, false, false) {
			writeSubError(c, nil)
		}
		a.sub.recordSubscriptionFetch(c)
	}
}

// readPortalPage prefers the on-disk build so XUI_DEBUG serves a fresh bundle, like the sub page.
func readPortalPage() ([]byte, error) {
	if body, err := os.ReadFile("internal/web/dist/portal.html"); err == nil {
		return body, nil
	}
	return fs.ReadFile(distFS, "dist/portal.html")
}

// page serves the portal SPA with its config inlined; json.Marshal escapes "<", so no setting closes the script.
func (a *PortalController) page(c *gin.Context) {
	body, err := a.readPage()
	if err != nil {
		c.String(http.StatusInternalServerError, "missing embedded portal page")
		return
	}
	title, _ := a.settings.GetSubTitle()
	cfg, err := json.Marshal(map[string]string{"basePath": portalPath, "subTitle": title})
	if err != nil {
		cfg = []byte("{}")
	}
	inject := append(append([]byte("<script>window.__PORTAL__="), cfg...), []byte(";</script></head>")...)
	setNoCacheHeaders(c)
	c.Data(http.StatusOK, "text/html; charset=utf-8", bytes.Replace(body, []byte("</head>"), inject, 1))
}
