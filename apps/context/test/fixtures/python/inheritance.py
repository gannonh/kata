"""Inheritance examples."""


class Base:
    """Base class."""

    def method(self) -> None:
        pass


class Child(Base):
    """Single inheritance."""

    def method(self) -> None:
        pass


class Multi(Child, Base):
    """Multiple inheritance."""

    def method(self) -> None:
        pass
