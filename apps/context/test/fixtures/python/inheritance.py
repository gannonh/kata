"""Inheritance examples."""


class Base:
    """Base class."""

    def method(self) -> None:
        pass


class Child(Base):
    """Single inheritance."""

    def method(self) -> None:
        pass


class Multi(Base, Child):
    """Multiple inheritance."""

    def method(self) -> None:
        pass
