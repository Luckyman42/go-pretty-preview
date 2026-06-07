// ─── Suggested VS Code settings for this file ───────────────────────────────
//
//  "goPreview.openByDefault": true,
//  "goPreview.rules.inlineOneLineIf": true   ← this is the default; try false too
//
// What to compare:
//  • inlineOneLineIf: true  → the preview collapses every single-statement if
//  • inlineOneLineIf: false → the preview mirrors the source exactly
//
// This file intentionally has many single-statement if/else blocks so the
// difference between the source and the preview is clearly visible.
// ─────────────────────────────────────────────────────────────────────────────

package example

import (
	"errors"
	"strconv"
	"strings"
	"unicode"
)

// Validator validates string inputs against configurable rules.
type Validator struct {
	minLen    int
	maxLen    int
	allowNums bool
}

// NewValidator returns a Validator with the given constraints.
func NewValidator(minLen, maxLen int, allowNums bool) *Validator {
	return &Validator{minLen: minLen, maxLen: maxLen, allowNums: allowNums}
}

// Check validates s and returns a human-readable error or nil.
func (v *Validator) Check(s string) error {
	if strings.TrimSpace(s) == "" {
		return errors.New("value is blank")
	}

	if len(s) < v.minLen {
		return errors.New("value too short")
	}

	if len(s) > v.maxLen {
		return errors.New("value too long")
	}

	if !v.allowNums {
		for _, r := range s {
			if unicode.IsDigit(r) {
				return errors.New("digits are not allowed")
			}
		}
	}

	return nil
}

// ParseInt converts s to int, returning defaultVal on any parse error.
func ParseInt(s string, defaultVal int) int {
	v, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return defaultVal
	}
	return v
}

// Clamp returns v clamped to [lo, hi].
func Clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// FirstNonEmpty returns the first non-empty string from the given list.
// Returns "" if all are empty.
func FirstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if s != "" {
			return s
		}
	}
	return ""
}

// Contains reports whether target is present in items.
func Contains[T comparable](items []T, target T) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

// Map applies f to each element of in and returns the results.
func Map[T, U any](in []T, f func(T) U) []U {
	if in == nil {
		return nil
	}
	out := make([]U, len(in))
	for i, v := range in {
		out[i] = f(v)
	}
	return out
}

// Filter returns elements of in for which keep returns true.
func Filter[T any](in []T, keep func(T) bool) []T {
	out := make([]T, 0, len(in))
	for _, v := range in {
		if keep(v) {
			out = append(out, v)
		}
	}
	return out
}

// Reduce folds in into a single value using f, starting with init.
func Reduce[T, A any](in []T, init A, f func(A, T) A) A {
	acc := init
	for _, v := range in {
		acc = f(acc, v)
	}
	return acc
}

// Ptr returns a pointer to v. Useful for optional struct fields.
func Ptr[T any](v T) *T {
	return &v
}

// Deref dereferences p, returning defaultVal if p is nil.
func Deref[T any](p *T, defaultVal T) T {
	if p == nil {
		return defaultVal
	}
	return *p
}
