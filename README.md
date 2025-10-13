# fmhistory
Timeline with a Historical Perspective of the Feature Models.

# How to execute the timeline
1. Execute `python -m http.server` in the main directory containing the index.html file.
2. Open `http://[::1]:8000/` in a web browser.

# How to update citations (from Semantic Scholar)
1. Create a virtual environment with Python: `python -m venv env`
2. Activate the virtual enviroment:
    - Linux: `. env/bin/activate`
    - Windows: `.\env\Scripts\Activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Execute `python update_citations.py`

To update only missing citations execute: `python update_citations.py --only-missing`
