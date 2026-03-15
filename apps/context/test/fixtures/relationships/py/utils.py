"""Utility functions."""

from models import User


def format_user(user: User) -> str:
    """Format a user for display."""
    return f"{user.name} <{user.email}>"


def create_user(name: str, email: str) -> User:
    """Create a new user instance."""
    return User(name, email)


def helper():
    """A simple helper function."""
    return 42
