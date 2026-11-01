package model

// TrafficHour is the proxy traffic every inbound (local and on nodes) carried in
// one hour; Hour is the unix second the local hour starts at.
type TrafficHour struct {
	Hour int64 `json:"hour" gorm:"primaryKey;autoIncrement:false"`
	Up   int64 `json:"up" gorm:"default:0"`
	Down int64 `json:"down" gorm:"default:0"`
}

func (TrafficHour) TableName() string { return "traffic_hours" }

// TrafficMonth is TrafficHour summed by local month and kept forever, for the
// dashboard's all-time chart; Month is the unix second the month starts at.
type TrafficMonth struct {
	Month int64 `json:"month" gorm:"primaryKey;autoIncrement:false"`
	Up    int64 `json:"up" gorm:"default:0"`
	Down  int64 `json:"down" gorm:"default:0"`
}

func (TrafficMonth) TableName() string { return "traffic_months" }

// InboundTrafficTotal is an inbound's all-time traffic, which traffic resets do
// not clear; LastUp/LastDown are the counters seen at the previous sample.
type InboundTrafficTotal struct {
	InboundId int   `json:"inboundId" gorm:"primaryKey;autoIncrement:false;column:inbound_id"`
	Up        int64 `json:"up" gorm:"default:0"`
	Down      int64 `json:"down" gorm:"default:0"`
	LastUp    int64 `json:"-" gorm:"column:last_up;default:0"`
	LastDown  int64 `json:"-" gorm:"column:last_down;default:0"`
}

func (InboundTrafficTotal) TableName() string { return "inbound_traffic_totals" }

// ClientTrafficTotal is InboundTrafficTotal for a client, keyed by email.
type ClientTrafficTotal struct {
	Email    string `json:"email" gorm:"primaryKey"`
	Up       int64  `json:"up" gorm:"default:0"`
	Down     int64  `json:"down" gorm:"default:0"`
	LastUp   int64  `json:"-" gorm:"column:last_up;default:0"`
	LastDown int64  `json:"-" gorm:"column:last_down;default:0"`
}

func (ClientTrafficTotal) TableName() string { return "client_traffic_totals" }
