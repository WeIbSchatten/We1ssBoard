package model

// TrafficHour is the proxy traffic every inbound (local and on nodes) carried in
// one hour; Hour is the unix second the local hour starts at.
type TrafficHour struct {
	Hour int64 `json:"hour" gorm:"primaryKey;autoIncrement:false"`
	Up   int64 `json:"up" gorm:"default:0"`
	Down int64 `json:"down" gorm:"default:0"`
}

func (TrafficHour) TableName() string { return "traffic_hours" }
