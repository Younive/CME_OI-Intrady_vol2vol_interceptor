# src/utils/data_handler.py
import json
import os
from datetime import datetime

def save_data(data, category, base_dir="."):
    """Saves intercepted data to the appropriate directory."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    folder = os.path.join(base_dir, category)
    if not os.path.exists(folder):
        os.makedirs(folder)
    
    filename = f"gold_{category}_{timestamp}.json"
    filepath = os.path.join(folder, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=4)
    print(f"[+] Saved {category} data to {filepath}")
