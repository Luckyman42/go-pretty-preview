// ─── Suggested VS Code settings for this file ───────────────────────────────
//
//  "goPreview.openByDefault": true,
//  "goPreview.rules.inlineOneLineIf": true,
//  "goPreview.rules.previewRules": {
//    "protect":   [],
//    "highlight": ["\\blog\\.Fatal", "\\bpanic\\("],
//    "hide":      ["\\bslog\\.Debug\\b"],
//    "fade":      ["\\bslog\\.Info\\b"]
//  },
//  "goPreview.rules.fadePackages": ["fmt", "errors", "slog", "log"]
//
// What to observe:
//  • The source has 12 slog.Debug calls scattered through processOrders.
//    With hide on slog.Debug they all disappear — the logic is front and center.
//    Open side-by-side (Ctrl+K V) to see the contrast.
//  • log.Fatal and panic are highlighted even when hide is active:
//    protect keeps them immune to other rules; highlight makes them stand out.
//  • All four if/else variants are present; compare source vs preview:
//      pattern 1 — single-statement if                      → collapses
//      pattern 2 — multi-statement if (log.Fatal inside)    → stays expanded
//      pattern 3 — if-else-if chain (all single-stmt)       → all branches collapse
//      pattern 4 — if 1-stmt / else-if multi-stmt / else 1-stmt → mixed collapse
// ─────────────────────────────────────────────────────────────────────────────

package example

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"time"
)

// Order represents an incoming purchase order.
type Order struct {
	ID         int
	UserID     int
	Items      []LineItem
	Total      float64
	Currency   string
	Notes      string
	ReceivedAt time.Time
}

// LineItem is one product entry within an order.
type LineItem struct {
	SKU   string
	Qty   int
	Price float64
}

// OrderStore persists validated orders and verifies users.
type OrderStore interface {
	Save(ctx context.Context, o *Order) error
	UserExists(ctx context.Context, userID int) (bool, error)
}

var (
	ErrEmptyBatch    = errors.New("batch is empty")
	ErrNegativeTotal = errors.New("negative total")
)

// processOrders validates, enriches, and persists a batch of incoming orders.
//
// All four if/else variants appear in this function (see inline comments).
func processOrders(ctx context.Context, batch []Order, store OrderStore) error {
	slog.Debug("processOrders: start", "count", len(batch))

	// pattern 1 — single-statement if (collapses in preview)
	if len(batch) == 0 {
		return ErrEmptyBatch
	}

	var accepted, skipped int

	for i := range batch {
		o := &batch[i]
		slog.Debug("loop: processing order", "id", o.ID, "user", o.UserID, "items", len(o.Items))

		if err := validateOrder(o); err != nil {
			slog.Debug("validation failed", "id", o.ID, "err", err)
			skipped++
			continue
		}
		slog.Debug("validation passed", "id", o.ID)

		// pattern 2 — multi-statement if body (stays expanded in preview)
		ok, err := store.UserExists(ctx, o.UserID)
		if err != nil {
			log.Fatalf("order store unreachable — aborting batch: %v", err)
			return fmt.Errorf("user lookup: %w", err)
		}
		if !ok {
			slog.Debug("unknown user, skipping order", "id", o.ID, "user", o.UserID)
			skipped++
			continue
		}
		slog.Debug("user verified", "user", o.UserID)

		// pattern 3 — inline if-else-if chain (all single-stmt, all collapse)
		if o.Currency == "" {
			o.Currency = "USD"
		} else if o.Currency == "us" || o.Currency == "US" {
			o.Currency = "USD"
		} else if o.Currency == "eu" || o.Currency == "EU" {
			o.Currency = "EUR"
		}
		slog.Debug("currency normalised", "id", o.ID, "currency", o.Currency)

		// pattern 4 — if 1-stmt / else-if multi-stmt / else 1-stmt
		if o.Total < 0 {
			return ErrNegativeTotal
		} else if o.Total == 0 {
			slog.Debug("total is zero, recalculating from items", "id", o.ID)
			o.Total = recalcTotal(o.Items)
			o.Notes = "total recalculated from items"
		} else {
			o.Notes = "total pre-verified"
		}
		slog.Debug("total settled", "id", o.ID, "total", o.Total)

		o.ReceivedAt = time.Now()
		slog.Debug("order enriched", "id", o.ID, "received_at", o.ReceivedAt)

		if err := store.Save(ctx, o); err != nil {
			slog.Debug("save failed", "id", o.ID, "err", err)
			return fmt.Errorf("save order %d: %w", o.ID, err)
		}
		slog.Debug("order saved successfully", "id", o.ID)

		accepted++
	}

	slog.Info("batch complete", "accepted", accepted, "skipped", skipped, "total", len(batch))

	if accepted == 0 && skipped == 0 {
		panic(fmt.Sprintf("processOrders: zero outcomes for batch of %d — check store", len(batch)))
	}

	return nil
}

// validateOrder checks that o has a non-zero user ID and at least one item.
func validateOrder(o *Order) error {
	if o.UserID == 0 {
		return errors.New("missing user ID")
	}
	if len(o.Items) == 0 {
		return errors.New("order has no items")
	}
	return nil
}

// recalcTotal returns the sum of qty×price for each line item.
func recalcTotal(items []LineItem) float64 {
	var total float64
	for _, it := range items {
		total += float64(it.Qty) * it.Price
	}
	return total
}
