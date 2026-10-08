"""
DecoAR — Exporta un modelo YOLOE (detección en el teléfono) especializado en interiores.

Basado en scripts/export_text_model.py de @reactvision/react-viro-onnx:
RepRTA "hornea" nuestras clases en la cabeza de detección usando embeddings de texto,
lo que da mucha más precisión que el modelo genérico de 4.585 clases.
El formato de salida (end2end, output0 [1,300,38]) es el que espera ViroObjectDetector.
"""
import shutil
import sys
from pathlib import Path

CLASSES = [
    # Asientos
    "sofa", "couch", "armchair", "chair", "stool", "bench", "ottoman",
    # Mesas y superficies
    "dining table", "coffee table", "side table", "desk", "kitchen counter",
    # Dormitorio y almacenamiento
    "bed", "nightstand", "wardrobe", "cabinet", "dresser", "shelf", "bookcase",
    # Cocina y baño
    "refrigerator", "stove", "oven", "microwave", "sink", "washing machine",
    "toilet", "bathtub", "shower",
    # Elementos del espacio
    "door", "window", "curtain", "rug", "mirror", "picture frame", "stairs",
    # Decoración y otros
    "tv", "lamp", "ceiling fan", "potted plant", "air conditioner",
    # Personas (para no confundirlas con muebles)
    "person",
]

def main() -> None:
    from ultralytics import YOLOE

    weights = sys.argv[1] if len(sys.argv) > 1 else "yoloe-26n-seg.pt"
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "assets/models/decoar-interior.onnx")
    print(f"[export] {weights} con {len(CLASSES)} clases de interiores")
    model = YOLOE(weights)
    model.set_classes(CLASSES, model.get_text_pe(CLASSES))
    path = model.export(format="onnx", imgsz=640, nms=True, opset=19, simplify=False)
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(path), out)
    print(f"[export] listo -> {out} ({out.stat().st_size / 1e6:.1f} MB)")

if __name__ == "__main__":
    main()