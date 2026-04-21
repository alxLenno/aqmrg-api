from flask import Blueprint, render_template

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    """
    Home page - Real-time Dashboard
    """
    return render_template('index.html')
