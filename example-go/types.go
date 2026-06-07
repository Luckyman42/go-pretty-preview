// Package example contains shared types used across multiple demo files.
// Ctrl+Click any type name in other files → jumps here.
package example

import "time"

// Role represents a user's permission level in the system.
type Role string

const (
	RoleAdmin  Role = "admin"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

// User represents an authenticated system user.
// Hover over "User" anywhere it is used to see this doc.
type User struct {
	ID        int
	Name      string
	Email     string
	Role      Role
	CreatedAt time.Time
}

// IsAdmin reports whether the user has administrator privileges.
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

// DisplayName returns the user's name, falling back to their email.
func (u *User) DisplayName() string {
	if u.Name != "" {
		return u.Name
	}
	return u.Email
}

// Storer defines the persistence contract for User objects.
// Implement this interface → gopls will offer "Add missing methods" (Ctrl+. / Quick Fix).
type Storer interface {
	Get(id int) (*User, error)
	Save(u *User) error
	Delete(id int) error
	List() ([]*User, error)
}

// Event represents an audit log entry tied to a user action.
type Event struct {
	ID        int
	UserID    int
	Action    string
	OccuredAt time.Time
}
