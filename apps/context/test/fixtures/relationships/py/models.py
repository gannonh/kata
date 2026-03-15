"""Data models for the application."""


class BaseModel:
    """Base class for all models."""

    def validate(self):
        """Validate the model."""
        pass


class User(BaseModel):
    """A user in the system."""

    def __init__(self, name: str, email: str):
        self.name = name
        self.email = email

    def greet(self) -> str:
        return f"Hello, {self.name}"


class Admin(User):
    """An admin user with extra privileges."""

    def __init__(self, name: str, email: str, level: int):
        super().__init__(name, email)
        self.level = level
