// ─── Ajánlott VSCode beállítások ehhez a fájlhoz ────────────────────────────
//
//  ".vscode/settings.json"-ba másolható blokk:
//
//  "goPreview.openByDefault": true,
//  "goPreview.rules.inlineOneLineIf": true,
//  "goPreview.rules.fadePackages": ["math"]
//
// Mit érdemes kipróbálni:
//  • Hover (egér / Ctrl+K Ctrl+I) bármelyik típus / függvény nevére
//    → a preview hover tooltip egyesíti a gopls doksit + az extension infót.
//  • A Calculator metódusai egysoros if-eket tartalmaznak: az inlineOneLineIf
//    rule összevonja őket a preview-ban → hasonlítsd össze a forrással.
// ─────────────────────────────────────────────────────────────────────────────

package example

import "math"

// Calculator performs basic floating-point arithmetic with configurable
// decimal precision. It is safe for concurrent use after creation.
//
// Hover over "Calculator" in 04_navigation.go to jump back here.
type Calculator struct {
	precision int
	history   []float64
}

// NewCalculator returns a Calculator that rounds results to precision decimal
// places. It panics if precision is negative.
func NewCalculator(precision int) *Calculator {
	if precision < 0 {
		panic("precision must be non-negative")
	}
	return &Calculator{precision: precision}
}

// Add returns the rounded sum of a and b, appending it to the history.
func (c *Calculator) Add(a, b float64) float64 {
	result := c.round(a + b)
	c.history = append(c.history, result)
	return result
}

// Sub returns the rounded difference a − b, appending it to the history.
func (c *Calculator) Sub(a, b float64) float64 {
	result := c.round(a - b)
	c.history = append(c.history, result)
	return result
}

// Mul returns the rounded product of a and b.
func (c *Calculator) Mul(a, b float64) float64 {
	result := c.round(a * b)
	c.history = append(c.history, result)
	return result
}

// Div returns the rounded quotient a / b.
// It returns 0 and false if b is zero.
func (c *Calculator) Div(a, b float64) (float64, bool) {
	if b == 0 {
		return 0, false
	}
	result := c.round(a / b)
	c.history = append(c.history, result)
	return result, true
}

// History returns a copy of all previously computed results in order.
func (c *Calculator) History() []float64 {
	out := make([]float64, len(c.history))
	copy(out, c.history)
	return out
}

// Clear resets the result history without changing the precision setting.
func (c *Calculator) Clear() {
	c.history = c.history[:0]
}

func (c *Calculator) round(v float64) float64 {
	shift := math.Pow(10, float64(c.precision))
	return math.Round(v*shift) / shift
}
