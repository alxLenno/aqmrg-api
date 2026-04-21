import pandas as pd
import json

df = pd.read_csv('aqmrg_data_2026-03-07.csv')

stats = {
    'describe': df['pm25'].describe().to_dict(),
    'skew': df['pm25'].skew(),
    'kurtosis': df['pm25'].kurt(),
    'correlations_with_pm25': df.select_dtypes(include=['float64', 'int64']).corr()['pm25'].sort_values(ascending=False).to_dict(),
    'missing_data': df.isnull().sum().to_dict()
}

print(json.dumps(stats, indent=2))
