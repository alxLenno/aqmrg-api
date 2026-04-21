#!/usr/bin/env python3
import os
import re

base = "/Users/lennoxkk/Documents/AIR QUALITY/aqmrg-api/Final_MSc_Proposal/src"
sections_file = os.path.join(base, "sections.tex")

with open(sections_file, 'r') as f:
    text = f.read()

# First, process figures
figures_content = []
fig_inputs = re.finditer(r'\\input\{figures/([^}]+)\}', text)

for match in fig_inputs:
    name = match.group(1)
    macro_name = "\\fig" + "".join(word.capitalize() for word in name.split('_'))
    
    # Read the file
    file_path = os.path.join(base, "figures", name + ".tex")
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            content = f.read().strip()
        
        figures_content.append(f"\\newcommand{{{macro_name}}}{{%\n{content}\n}}\n")
        text = text.replace(match.group(0), macro_name)

if figures_content:
    with open(os.path.join(base, "figures.tex"), 'w') as f:
        f.write("\n".join(figures_content))


# Now, process tables. Note: \input{tables} at top shouldn't be touched.
# Only \input{tables_ext/...}
tables_content = []
# We start tables.tex by preserving the first table (which is the landscape table that was already there)
# Let's read tables.tex, get everything before the appended ones (or just overwrite if we want to be clean)
# It's better to just build tables.tex fresh: 
# The original tables.tex had the longtable. We need to preserve it.
tables_path = os.path.join(base, "tables.tex")
if os.path.exists(tables_path):
    with open(tables_path, 'r') as f:
        orig_tables = f.read()
    
    # Simple hack: find the first \end{landscape} and take everything up to there.
    end_ls = orig_tables.find("\\end{landscape}")
    if end_ls != -1:
        base_tables_content = orig_tables[:end_ls + len("\\end{landscape}")] + "\n\n"
    else:
        base_tables_content = ""
else:
    base_tables_content = ""

tab_inputs = re.finditer(r'\\input\{tables_ext/([^}]+)\}', text)
for match in tab_inputs:
    name = match.group(1)
    macro_name = "\\tab" + "".join(word.capitalize() for word in name.split('_'))
    
    file_path = os.path.join(base, "tables_ext", name + ".tex")
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            content = f.read().strip()
            
        tables_content.append(f"\\newcommand{{{macro_name}}}{{%\n{content}\n}}\n")
        text = text.replace(match.group(0), macro_name)

if tables_content:
    with open(os.path.join(base, "tables.tex"), 'w') as f:
        f.write(base_tables_content + "\n".join(tables_content))


with open(sections_file, 'w') as f:
    f.write(text)

print("Macros generated inside figures.tex and tables.tex and inserted into sections.tex")
