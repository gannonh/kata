"""Helper module in subpackage for testing relative imports."""

from ..models import User
from ..utils import format_user


def describe_user(user: User) -> str:
    """Describe a user using parent package utilities."""
    return f"User: {format_user(user)}"


class SpecialUser(User):
    """A special user from the subpackage."""

    def special_greet(self):
        return "I am special"
