// ─── Suggested VS Code settings for this file ───────────────────────────────
//
//  "goPreview.openByDefault": true,
//  "goPreview.rules.fadePackages": ["fmt", "sync", "context", "errors", "strings", "log"]
//
// What to try:
//  • Enable fadePackages with the list above → all "fmt.", "sync.", "context."
//    prefixes dim in the preview, letting the function names stand out.
//  • Try with an empty list [] → all prefixes visible → compare the difference.
//  • The preview keeps focus on logic, not package names.
// ─────────────────────────────────────────────────────────────────────────────

package example

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
)

// Cache is a goroutine-safe in-memory key/value store.
type Cache struct {
	mu    sync.RWMutex
	items map[string]string
}

// NewCache initialises an empty Cache.
func NewCache() *Cache {
	return &Cache{items: make(map[string]string)}
}

// Set stores value under key.
// Returns an error if the context is cancelled or the key is blank.
func (c *Cache) Set(ctx context.Context, key, value string) error {
	if strings.TrimSpace(key) == "" {
		return errors.New("key must not be blank")
	}
	select {
	case <-ctx.Done():
		return fmt.Errorf("cache.Set cancelled: %w", ctx.Err())
	default:
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = value
	log.Printf("cache: stored %q", key)
	return nil
}

// Get returns the value and true if key exists, otherwise "", false.
func (c *Cache) Get(ctx context.Context, key string) (string, bool) {
	select {
	case <-ctx.Done():
		log.Printf("cache: Get(%q) cancelled", key)
		return "", false
	default:
	}

	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.items[key]
	return v, ok
}

// Delete removes a key from the cache. It is a no-op if the key is absent.
func (c *Cache) Delete(_ context.Context, key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, key)
	log.Printf("cache: deleted %q", key)
}

// Len returns the number of entries currently in the cache.
func (c *Cache) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

// Keys returns all keys in an unspecified order.
func (c *Cache) Keys() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	keys := make([]string, 0, len(c.items))
	for k := range c.items {
		keys = append(keys, k)
	}
	return keys
}

// Dump returns a multi-line string listing every key → value pair.
func (c *Cache) Dump() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var sb strings.Builder
	for k, v := range c.items {
		fmt.Fprintf(&sb, "%s → %s\n", k, v)
	}
	return sb.String()
}

// merge copies all entries from other into c, preferring c on conflict.
func (c *Cache) merge(other *Cache) {
	other.mu.RLock()
	snapshot := make(map[string]string, len(other.items))
	for k, v := range other.items {
		snapshot[k] = v
	}
	other.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()
	for k, v := range snapshot {
		if _, exists := c.items[k]; !exists {
			c.items[k] = v
		}
	}
	log.Printf("cache: merged %d entries", len(snapshot))
}

// errNotFound is returned when a key is absent.
var errNotFound = errors.New("cache: key not found")

// MustGet returns the value or panics with errNotFound.
func (c *Cache) MustGet(ctx context.Context, key string) string {
	v, ok := c.Get(ctx, key)
	if !ok {
		panic(fmt.Errorf("%w: %q", errNotFound, key))
	}
	return v
}
