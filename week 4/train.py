import pandas as pd
from sklearn.linear_model import LinearRegression
import pickle
import os

# Ensure model directory exists
os.makedirs("model", exist_ok=True)

# Load data
df = pd.read_csv("data/cafeteria.csv")

# Convert weather to numbers
weather_mapping = {"Sunny": 0, "Cloudy": 1, "Rainy": 2}
df["weather"] = df["weather"].map(weather_mapping)

# Features and Target
X = df[["temperature", "weather"]]
y = df["people_count"]

# Train model
model = LinearRegression()
model.fit(X, y)

# Save model
with open("model/model.pkl", "wb") as f:
    pickle.dump(model, f)

print("Model trained and saved to model/model.pkl")
