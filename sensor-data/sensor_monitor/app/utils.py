from datetime import datetime, timedelta

def get_eat_time():
    """
    Returns the current time in East Africa Time (UTC+3)
    """
    return datetime.utcnow() + timedelta(hours=3)
