package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestResolveHostPrefersForwardedHostOverRealIP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Request.Host = "panel.example.com:2053"
	c.Request.RemoteAddr = "127.0.0.1:12345"
	c.Request.Header.Set("X-Forwarded-Host", "sub.example.net:443")
	c.Request.Header.Set("X-Real-IP", "198.51.100.7")

	if got := resolveHost(c); got != "sub.example.net" {
		t.Fatalf("resolveHost = %q, want X-Forwarded-Host", got)
	}
}

func TestResolveHostIgnoresRealIPFromTrustedProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Request.Host = "panel.example.com:2053"
	c.Request.RemoteAddr = "127.0.0.1:12345"
	c.Request.Header.Set("X-Real-IP", "198.51.100.7")

	if got := resolveHost(c); got != "panel.example.com" {
		t.Fatalf("resolveHost = %q, want request host (not X-Real-IP)", got)
	}
}
