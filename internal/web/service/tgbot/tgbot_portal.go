package tgbot

import "html"

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
