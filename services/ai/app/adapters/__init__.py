"""Adapter di modello registrabili."""

from .base import ModelAdapter
from .segmentation import SegmentationAdapter

__all__ = ["ModelAdapter", "SegmentationAdapter"]
