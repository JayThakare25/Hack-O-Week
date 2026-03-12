from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import pickle
import json
import os
import pandas as pd

app = FastAPI()

# Add CORS to allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model
model_path = os.path.join(os.path.dirname(__file__), "../model/model.pkl")
with open(model_path, "rb") as f:
    model = pickle.load(f)

@app.get("/predict")
def predict(temp: float, weather: int):
    # Use DataFrame to match training data structure (silences warnings)
    input_data = pd.DataFrame([[temp, weather]], columns=["temperature", "weather"])
    pred = model.predict(input_data)
    return {"prediction": float(pred[0])}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    while True:
        try:
            data = await ws.receive_json()
            # Expecting data like {"temp": 32, "weather": 0}
            input_data = pd.DataFrame([[data["temp"], data["weather"]]], columns=["temperature", "weather"])
            pred = model.predict(input_data)
            await ws.send_json({"prediction": float(pred[0])})
        except Exception as e:
            print(f"Error: {e}")
            break
