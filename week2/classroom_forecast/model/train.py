import pandas as pd
import pickle
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller

print("Loading data...")
df = pd.read_csv("data/usage.csv")

df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.set_index('timestamp')

# resample hourly if needed
df = df.resample('1H').mean()

print(df.head())

print("Checking stationarity...")
result = adfuller(df['electricity'].dropna())
print("ADF Statistic:", result[0])
print("p-value:", result[1])

# Train ARIMA Model
print("Training ARIMA model...")
model = ARIMA(df['electricity'], order=(2,1,2))
model_fit = model.fit()

print(model_fit.summary())

# Save Model
print("Saving model to model/arima.pkl...")
with open("model/arima.pkl", "wb") as f:
    pickle.dump(model_fit, f)

print("Model saved successfully.")
