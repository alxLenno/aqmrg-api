#!/usr/bin/env python3
"""Extract all figures and tables from section files into separate files."""
import re, os

base = "/Users/lennoxkk/Documents/AIR QUALITY/aqmrg-api/Final_MSc_Proposal/src"
fig_dir = os.path.join(base, "figures")
tab_dir = os.path.join(base, "tables_ext")
os.makedirs(fig_dir, exist_ok=True)
os.makedirs(tab_dir, exist_ok=True)

section_files = [
    "sections/01_introduction.tex",
    "sections/02_literature_review.tex",
    "sections/03_methodology.tex",
    "sections/04_expected_outcomes.tex",
    "sections/05_workplan_budget.tex",
]

for secfile in section_files:
    filepath = os.path.join(base, secfile)
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    prefix = os.path.basename(secfile).replace('.tex', '')
    
    # Extract figures
    fig_count = 0
    fig_pattern = re.compile(r'(\\begin\{figure\}.*?\\end\{figure\})', re.DOTALL)
    for match in fig_pattern.finditer(content):
        fig_count += 1
        block = match.group(1)
        
        # Try to get the label for naming
        label_m = re.search(r'\\label\{([^}]+)\}', block)
        if label_m:
            name = label_m.group(1).replace(':', '_').replace('fig_', '')
        else:
            name = f"fig{fig_count}"
        
        fname = f"{prefix}_{name}.tex"
        outpath = os.path.join(fig_dir, fname)
        with open(outpath, 'w') as f:
            f.write(block + "\n")
        
        # Replace in content
        content = content.replace(block, f"\\input{{figures/{fname.replace('.tex', '')}}}")
        print(f"  FIG: {fname}")
    
    # Extract tables
    tab_count = 0
    tab_pattern = re.compile(r'(\\begin\{table\}.*?\\end\{table\})', re.DOTALL)
    for match in tab_pattern.finditer(content):
        tab_count += 1
        block = match.group(1)
        
        label_m = re.search(r'\\label\{([^}]+)\}', block)
        if label_m:
            name = label_m.group(1).replace(':', '_').replace('tab_', '')
        else:
            name = f"tab{tab_count}"
        
        fname = f"{prefix}_{name}.tex"
        outpath = os.path.join(tab_dir, fname)
        with open(outpath, 'w') as f:
            f.write(block + "\n")
        
        content = content.replace(block, f"\\input{{tables_ext/{fname.replace('.tex', '')}}}")
        print(f"  TAB: {fname}")
    
    # Write modified section file
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"Processed {secfile}: {fig_count} figures, {tab_count} tables extracted")

print("\nDone!")
