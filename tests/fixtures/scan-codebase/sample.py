# sample.py - Test fixture for scan-codebase.cjs Python extraction
# Known imports and exports for deterministic testing

import os
import sys
from pathlib import Path
from typing import Optional, List
from .models import User
from ..utils import hash_password

# This is a commented import that should NOT be extracted:
# import fake_module

def create_user(name, email):
    """Create a new user."""
    return User(name=name, email=email)

class UserRepository:
    """Repository for user data."""
    def __init__(self):
        self.users = []
