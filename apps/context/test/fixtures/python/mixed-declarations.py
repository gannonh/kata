"""Module with mixed declarations."""

VERSION = "1.0.0"


def helper(x: int) -> int:
    """A helper function."""
    return x + 1


class Config:
    """Configuration class."""

    def __init__(self):
        self.debug = False

    @property
    def is_debug(self) -> bool:
        return self.debug


async def main() -> None:
    """Entry point."""
    pass


@staticmethod
def standalone_decorated() -> str:
    """A standalone decorated function (unusual but valid)."""
    return "hello"
