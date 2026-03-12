import streamlit as st
import pickle
import pandas as pd
import numpy as np
import os

# Load model
model_path = os.path.join(os.path.dirname(__file__), "../model/arima.pkl")
try:
    with open(model_path, "rb") as f:
        model = pickle.load(f)
except FileNotFoundError:
    st.error("Model file not found. Please run the training script first.")
    st.stop()

st.title("Classroom Electricity Forecast")
st.markdown("Predict the next hour's electricity consumption based on historical usage.")

if st.button("Predict Next Hour"):
    # Forecast
    forecast = model.get_forecast(steps=1)
    mean = forecast.predicted_mean.iloc[0]
    conf = forecast.conf_int().iloc[0]

    # Display results
    col1, col2, col3 = st.columns(3)
    col1.metric("Predicted Usage", f"{mean:.2f} kWh")
    col2.metric("Lower Bound (95%)", f"{conf.iloc[0]:.2f} kWh")
    col3.metric("Upper Bound (95%)", f"{conf.iloc[1]:.2f} kWh")
    
    st.success(f"Forecast for next hour: **{mean:.2f} kWh**")
    
    # Optional: Display recent data if available (mocking for now as we don't load the csv here)
    st.write("Confidence Interval:", conf.values)
    
st.write("---")
st.caption("Powered by ARIMA Model")
