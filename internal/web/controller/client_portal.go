package controller

import (
	"github.com/gin-gonic/gin"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/entity"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/portal"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/tgbot"
)

// portalService is created per call: it is stateless and reads settings on use.
func (a *ClientController) portalService() *portal.Service {
	return portal.New(&a.settingService)
}

func (a *ClientController) portalAccess(c *gin.Context) {
	svc := a.portalService()
	rec, err := svc.ClientByEmail(c.Param("email"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.clients.portal.clientNotFound"), err)
		return
	}
	access, err := svc.AccessOf(rec.Id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	enabled, err := a.settingService.GetPortalEnabled()
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonObj(c, entity.ClientPortalAccess{
		Status: string(access.Status), HiddenKeys: access.HiddenKeys, Devices: access.Devices, PortalEnabled: enabled,
		PortalURL: svc.PageURL(c.Request.Host),
	}, nil)
}

func (a *ClientController) portalPassword(c *gin.Context) {
	svc := a.portalService()
	rec, err := svc.ClientByEmail(c.Param("email"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.clients.portal.clientNotFound"), err)
		return
	}
	password, err := svc.IssueTemporaryPassword(rec.Id)
	if err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	sent := (&tgbot.Tgbot{}).SendPortalPassword(rec.TgID, rec.Email, password)
	jsonMsgObj(c, I18nWeb(c, "pages.clients.portal.passwordIssued"), entity.ClientPortalPassword{Password: password, SentToTelegram: sent}, nil)
}

func (a *ClientController) portalRevoke(c *gin.Context) {
	svc := a.portalService()
	rec, err := svc.ClientByEmail(c.Param("email"))
	if err != nil {
		jsonMsg(c, I18nWeb(c, "pages.clients.portal.clientNotFound"), err)
		return
	}
	if err := svc.RevokeAccess(rec.Id); err != nil {
		jsonMsg(c, I18nWeb(c, "somethingWentWrong"), err)
		return
	}
	jsonMsg(c, I18nWeb(c, "pages.clients.portal.revoked"), nil)
}
