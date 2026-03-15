"""Class with various method types."""


class Animal:
    """Base animal class."""

    def __init__(self, name: str, species: str):
        """Initialize the animal."""
        self.name = name
        self.species = species

    def speak(self) -> str:
        """Make the animal speak."""
        return ""

    async def fetch_info(self) -> dict:
        """Fetch animal info asynchronously."""
        return {}

    @staticmethod
    def create(kind: str) -> "Animal":
        """Factory method."""
        return Animal(kind, kind)

    @classmethod
    def from_dict(cls, data: dict) -> "Animal":
        """Create from dictionary."""
        return cls(data["name"], data["species"])

    @property
    def display_name(self) -> str:
        """Get the display name."""
        return f"{self.name} ({self.species})"
