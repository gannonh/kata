"""Helper utilities in Python."""


def calculate_average(values: list[float]) -> float:
    """Calculate the average of a list of numbers."""
    if not values:
        return 0.0
    return sum(values) / len(values)


class DataProcessor:
    """Processes data records."""

    def __init__(self, name: str):
        """Initialize with processor name."""
        self.name = name

    def process(self, data: list) -> list:
        """Process a list of data items."""
        return [item for item in data if item is not None]

    @staticmethod
    def validate(item) -> bool:
        """Check if an item is valid."""
        return item is not None
