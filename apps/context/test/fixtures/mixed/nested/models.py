"""Nested Python module with models."""


class BaseModel:
    """Base model class."""

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {}


class UserModel(BaseModel):
    """User model."""

    def __init__(self, name: str, email: str):
        """Initialize user model."""
        self.name = name
        self.email = email

    def to_dict(self) -> dict:
        """Convert user to dictionary."""
        return {"name": self.name, "email": self.email}
