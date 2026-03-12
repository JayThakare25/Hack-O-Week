import pandas as pd
import numpy as np
import streamlit as st
import plotly.graph_objects as go
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import matplotlib.pyplot as plt

# Set page config
st.set_page_config(page_title="Library Energy Predictor", layout="wide")

st.title("📚 Library Energy During Exams")

# 1. Load Data
try:
    energy = pd.read_csv("project/energy.csv", parse_dates=["date"])
    events = pd.read_csv("project/events.csv", parse_dates=["date"])
except FileNotFoundError:
    # Fallback for when running from project root or inside project dir
    try:
        energy = pd.read_csv("energy.csv", parse_dates=["date"])
        events = pd.read_csv("events.csv", parse_dates=["date"])
    except FileNotFoundError:
        st.error("Data files not found. Please ensure energy.csv and events.csv exist.")
        st.stop()

# 2. Preprocess Data
energy = energy.set_index("date")
# Resample to daily frequency (sum) and fill missing values forward just in case
daily_energy = energy.resample("D").sum().ffill()

# Merge events (Create an event marker)
# Ensure we map events to the daily index
daily_energy["event"] = daily_energy.index.isin(events["date"]).astype(int)

# 3. Forecast using Exponential Smoothing (Holt-Winters)
# We use additive trend. Seasonal might be too short for this dataset (2 months), 
# but we'll let it infer or just use trend.
try:
    model = ExponentialSmoothing(
        daily_energy["energy_kwh"],
        trend="add",
        seasonal=None, 
        initialization_method="estimated"
    )
    fit = model.fit()
    forecast_days = 14
    forecast = fit.forecast(forecast_days)
except Exception as e:
    st.error(f"Forecasting Error: {e}")
    st.stop()

# 4. Calculate Metrics
predicted_load = forecast.mean()
max_capacity = 500  # library max expected kWh
usage_percent = (predicted_load / max_capacity) * 100

# 5. Display Dashboard

# Gauge Chart
st.subheader("Predicted Semester-End Energy Load")
fig_gauge = go.Figure(go.Indicator(
    mode="gauge+number",
    value=usage_percent,
    title={'text': "Predicted Load % (of 500kWh Max)"},
    gauge={
        'axis': {'range': [0, 100]},
        'bar': {'color': "darkblue"},
        'steps': [
            {'range': [0, 50], 'color': "lightgreen"},
            {'range': [50, 80], 'color': "yellow"},
            {'range': [80, 100], 'color': "red"}
        ],
    }
))
st.plotly_chart(fig_gauge)

# Line Chart (Historical + Forecast)
st.subheader("Energy Usage Forecast")

# Combine for plotting
# Identify split point
last_hist_date = daily_energy.index[-1]
forecast_index = pd.date_range(start=last_hist_date + pd.Timedelta(days=1), periods=forecast_days)
forecast_series = pd.Series(forecast.values, index=forecast_index)

# Plot using matplotlib/Streamlit native or Plotly. 
# User guide used st.line_chart which is easy.
# We need to combine them into one DF for st.line_chart to show them nicely, 
# or just pass the combined series.

combined_df = pd.DataFrame({
    "Historical": daily_energy["energy_kwh"],
    "Forecast": forecast_series
})

st.line_chart(combined_df)

# Show events table
st.subheader("Upcoming Events")
st.table(events)
