package entity

// ClientPortalAccess is a client's portal login state as the admin client card shows it.
type ClientPortalAccess struct {
	Status        string `json:"status" example:"temporary"`
	HiddenKeys    int    `json:"hiddenKeys" example:"2"`
	Devices       int    `json:"devices" example:"1"`
	PortalEnabled bool   `json:"portalEnabled" example:"true"`
	PortalURL     string `json:"portalUrl" example:"https://vpn.example.com:2096/portal"`
}

// ClientPortalPassword is a freshly issued temporary portal password, shown to the admin once.
type ClientPortalPassword struct {
	Password       string `json:"password" example:"k7QmN2pXa9Rz"`
	SentToTelegram bool   `json:"sentToTelegram" example:"true"`
}
