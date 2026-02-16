// sample.go - Test fixture for scan-codebase.cjs Go extraction
// Known imports and exports for deterministic testing

package main

import (
	"fmt"
	"net/http"
	"github.com/gin-gonic/gin"
)

// StartServer is exported (capitalized)
func StartServer(port int) {
	fmt.Printf("Starting server on port %d\n", port)
}

// HandleRequest is exported (capitalized)
func HandleRequest(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("OK"))
}

// helperFunc is NOT exported (lowercase)
func helperFunc() string {
	return "internal"
}
