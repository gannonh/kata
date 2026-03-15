"""Service layer with imports and inheritance."""

from models import BaseModel, User
from utils import format_user, helper
import models


class UserService(BaseModel):
    """Service that manages users."""

    def get_display(self, user: User) -> str:
        return format_user(user)

    def do_work(self):
        result = helper()
        return result


class AdminService(UserService):
    """Extended service for admin operations."""

    def promote(self, user):
        return models.Admin(user.name, user.email, 1)
