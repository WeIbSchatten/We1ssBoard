package tgbot

import (
	"html"
	"strconv"

	"github.com/mymmrac/telego"
	tu "github.com/mymmrac/telego/telegoutil"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/portal"
)

// SendPortalPassword sends a client its temporary portal password; false when the bot
// is not running or the client has no Telegram ID, so the caller shows it instead.
func (t *Tgbot) SendPortalPassword(tgID int64, email, password string) bool {
	if tgID == 0 || !t.IsRunning() {
		return false
	}
	t.SendMsgToTgbot(tgID, t.I18nBot("tgbot.messages.portalTempPassword",
		"Email=="+html.EscapeString(email), "Password=="+html.EscapeString(password)))
	return true
}

// listPortalClients offers the user's own clients to pick one for a portal password reset.
func (t *Tgbot) listPortalClients(chatID, tgUserID int64) {
	traffics, err := t.inboundService.GetClientTrafficTgBot(tgUserID)
	if err != nil {
		t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.answers.errorOccurred")+"\r\n"+err.Error())
		return
	}
	if len(traffics) == 0 {
		t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.answers.askToAddUserId", "TgUserID=="+strconv.FormatInt(tgUserID, 10)))
		return
	}
	buttons := make([]telego.InlineKeyboardButton, 0, len(traffics))
	for _, tr := range traffics {
		buttons = append(buttons, tu.InlineKeyboardButton(tr.Email).WithCallbackData(t.encodeQuery("client_portal_password "+tr.Email)))
	}
	t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.commands.pleaseChoose"), tu.InlineKeyboardGrid(tu.InlineKeyboardCols(1, buttons...)))
}

// askPortalReset confirms first: a reset logs the client out of every device.
func (t *Tgbot) askPortalReset(chatID int64, email string) {
	keyboard := tu.InlineKeyboard(tu.InlineKeyboardRow(
		tu.InlineKeyboardButton(t.I18nBot("tgbot.buttons.confirmPortalReset")).WithCallbackData(t.encodeQuery("client_portal_password_c " + email)),
	))
	t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.messages.portalResetConfirm", "Email=="+html.EscapeString(email)), keyboard)
}

// resetPortalPassword issues a temporary portal password to the client's own chat.
func (t *Tgbot) resetPortalPassword(chatID int64, email string) {
	if on, err := t.settingService.GetPortalEnabled(); err != nil || !on {
		t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.messages.portalDisabled"))
		return
	}
	svc := portal.New(&t.settingService)
	rec, err := svc.ClientByEmail(email)
	if err != nil {
		t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.answers.errorOperation"))
		return
	}
	// Only an admin grants first access, so a revoked client cannot let itself back in.
	if rec.PortalPasswordHash == "" {
		msg := "tgbot.messages.portalNoAccess"
		if _, ldapOn, err := t.settingService.GetLdapConfig(); err == nil && ldapOn {
			msg = "tgbot.messages.portalLdapManaged"
		}
		t.SendMsgToTgbot(chatID, t.I18nBot(msg))
		return
	}
	password, err := svc.IssueTemporaryPassword(rec.Id)
	if err != nil {
		t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.answers.errorOperation"))
		return
	}
	t.SendMsgToTgbot(chatID, t.I18nBot("tgbot.messages.portalTempPassword",
		"Email=="+html.EscapeString(email), "Password=="+html.EscapeString(password)))
}
