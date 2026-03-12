from datetime import datetime, timedelta
import random
import csv

start_date = datetime(2026, 1, 1, 9, 0)
data = []

# Generate data for 30 days, from 9 AM to 5 PM
for day in range(30):
    for hour in range(9, 18): # 9 to 17 (5 PM)
        current_time = start_date + timedelta(days=day, hours=hour-9)
        
        # Simulate occupancy: more people in middle of day
        if 11 <= hour <= 14:
            occupancy = random.randint(20, 50)
        else:
            occupancy = random.randint(5, 25)
            
        # Simulate electricity usage based on occupancy + random noise
        # Base load 2.0 kWh + 0.1 kWh per person + noise
        electricity = 2.0 + (occupancy * 0.1) + random.uniform(-0.5, 0.5)
        
        data.append([current_time.strftime("%Y-%m-%d %H:%M"), occupancy, round(electricity, 2)])

header = ["timestamp", "occupancy", "electricity"]

with open("data/usage.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(header)
    writer.writerows(data)

print("Data generated successfully.")
