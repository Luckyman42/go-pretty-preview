// ─── Suggested VS Code settings for this file ───────────────────────────────
//
//  "goPreview.openByDefault": true,
//  "goPreview.rules.fadePackages": ["fmt", "errors"],
//  "goPreview.rules.inlineOneLineIf": true
//
// Try Ctrl+Click (Go to Definition):
//  • "User"    → types.go: User struct
//  • "Role"    → types.go: Role type + constants
//  • "Storer"  → types.go: Storer interface
//  • "Event"   → types.go: Event struct
//
// Try LSP suggestions:
//  • MemoryStore does not implement all Storer methods →
//    gopls underlines it; hover and press Ctrl+. → "Add missing methods" quick fix
//  • Hover any type or method name → gopls doc tooltip
// ─────────────────────────────────────────────────────────────────────────────

package example

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// MemoryStore is an in-memory implementation of the Storer interface.
// Ctrl+Click a "Storer"-re → types.go:Storer
type MemoryStore struct {
	mu      sync.RWMutex
	records map[int]*User
	nextID  int
}

// NewMemoryStore returns an empty, ready-to-use MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{records: make(map[int]*User), nextID: 1}
}

// Get returns the User with the given id.
// Ctrl+Click a "User"-re → types.go:User
func (m *MemoryStore) Get(id int) (*User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.records[id]
	if !ok {
		return nil, fmt.Errorf("user %d not found", id)
	}
	return u, nil
}

// Save persists u. If u.ID is 0 a new ID is assigned.
func (m *MemoryStore) Save(u *User) error {
	if u == nil {
		return errors.New("user must not be nil")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if u.ID == 0 {
		u.ID = m.nextID
		m.nextID++
	}
	if u.CreatedAt.IsZero() {
		u.CreatedAt = time.Now()
	}
	clone := *u
	m.records[u.ID] = &clone
	return nil
}

// Delete removes the user with id from the store.
func (m *MemoryStore) Delete(id int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.records[id]; !ok {
		return fmt.Errorf("user %d not found", id)
	}
	delete(m.records, id)
	return nil
}

// List returns all stored users in an unspecified order.
func (m *MemoryStore) List() ([]*User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*User, 0, len(m.records))
	for _, u := range m.records {
		clone := *u
		out = append(out, &clone)
	}
	return out, nil
}

// UserService orchestrates user-related operations.
// Ctrl+Click "Storer" → types.go interface definition
type UserService struct {
	store  Storer
	events []Event
}

// NewUserService creates a service backed by the given store.
func NewUserService(store Storer) *UserService {
	return &UserService{store: store}
}

// CreateAdmin creates a new admin user and records an audit event.
// Ctrl+Click "User" or "RoleAdmin" → types.go constants
func (s *UserService) CreateAdmin(name, email string) (*User, error) {
	u := &User{
		Name:  name,
		Email: email,
		Role:  RoleAdmin,
	}
	if err := s.store.Save(u); err != nil {
		return nil, fmt.Errorf("CreateAdmin: %w", err)
	}
	s.record(u.ID, "created_as_admin")
	return u, nil
}

// Promote upgrades a user's role to admin.
// Ctrl+Click "IsAdmin" → types.go: User.IsAdmin method
func (s *UserService) Promote(id int) error {
	u, err := s.store.Get(id)
	if err != nil {
		return err
	}
	if u.IsAdmin() {
		return fmt.Errorf("user %d is already an admin", id)
	}
	u.Role = RoleAdmin
	if err := s.store.Save(u); err != nil {
		return fmt.Errorf("Promote: %w", err)
	}
	s.record(id, "promoted_to_admin")
	return nil
}

// FindByEmail returns the first user whose email matches, or nil.
func (s *UserService) FindByEmail(email string) (*User, error) {
	users, err := s.store.List()
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, nil
}

// AuditLog returns all recorded events.
// Ctrl+Click az "Event"-re → types.go:Event struct
func (s *UserService) AuditLog() []Event {
	out := make([]Event, len(s.events))
	copy(out, s.events)
	return out
}

func (s *UserService) record(userID int, action string) {
	s.events = append(s.events, Event{
		ID:        len(s.events) + 1,
		UserID:    userID,
		Action:    action,
		OccuredAt: time.Now(),
	})
}
