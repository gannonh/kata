"""Decorated function examples."""


def my_decorator(func):
    """A simple decorator."""
    return func


@my_decorator
def decorated_func(x: int) -> int:
    """A decorated function."""
    return x * 2


@my_decorator
def another_decorated():
    pass
