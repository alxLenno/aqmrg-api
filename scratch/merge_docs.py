import re
import os
import shutil

root_dir = "/Users/lennoxkk/Documents/AIR QUALITY/aqmrg-api"
hw_main = os.path.join(root_dir, "Heat_wave/main.tex")
rp_main = os.path.join(root_dir, "research_proposal.tex")
out_file = os.path.join(root_dir, "research_proposal_merged.tex")

# Backup
shutil.copy2(rp_main, rp_main + ".bak")

# Read files
with open(hw_main, 'r') as f:
    hw_content = f.read()
    
with open(rp_main, 'r') as f:
    rp_content = f.read()

# 1. Extract Preamble packages and commands from RP
# Look for anything between \usepackage... down to \begin{document}
preamble_match = re.search(r'\\usepackage\[utf8\]\{inputenc\}.*?(?=\\begin\{document\})', rp_content, re.DOTALL)
preamble_content = preamble_match.group(0) if preamble_match else ""

# Clean up redundant packages standard to both, but keep TikZ related stuff
tikz_stuff_str = []
in_tikz = False
for line in preamble_content.split('\n'):
    if line.startswith(r'\pgfplotsset') or line.startswith(r'\usetikzlibrary') or line.startswith(r'\tikzset') or line.startswith(r'\definecolor'):
        tikz_stuff_str.append(line)
        in_tikz = True
    elif in_tikz and line.strip() != "" and not line.startswith(r'\usepackage'):
        tikz_stuff_str.append(line)
    elif in_tikz and line.strip() == "":
        in_tikz = False

tikz_preamble = "\n% --- AQMRG TIKZ SETTINGS ---\n" + "\n".join(tikz_stuff_str)

# Inject preamble into HW main.tex
# Find the end of preamble in HW
insert_pos = hw_content.find(r'\begin{document}')
hw_mod1 = hw_content[:insert_pos] + tikz_preamble + "\n\n" + hw_content[insert_pos:]

# 2. Extract technical sections from RP
# We want from \section{System Architecture Overview} down to the end of the document (excluding \end{document})
arch_start = rp_content.find(r'\section{System Architecture Overview}')
if arch_start == -1:
    print("Could not find start of architecture section")

rp_tech = rp_content[arch_start:]
# Remove \end{document}
rp_tech = rp_tech.replace(r'\end{document}', '')

# We will split rp_tech into two blocks:
# Block 1: Methodology (Arch overview to Observability)
# Block 2: Outcomes & Stack (Results and Expected Outcomes to the end)

results_start = rp_tech.find(r'\section{Results and Expected Outcomes}')
conclusion_start = rp_tech.find(r'\section{Conclusion}')

block_meth = rp_tech[:results_start]
block_outcomes = rp_tech[results_start:conclusion_start]
block_conclusion = rp_tech[conclusion_start:]

# Fix section naming in block_outcomes
block_outcomes = block_outcomes.replace(r'\section{Results and Expected Outcomes}', r'\section{System Performance and Technology Summary}')

# Fix conclusion to be a chapter
block_conclusion = block_conclusion.replace(r'\section{Conclusion}', r'\chapter{CONCLUSION}')

# 3. Inject blocks into hw_mod1

# Inject Methodology block (block_meth) at the end of Chapter 3 in hw_mod1
ch4_start = hw_mod1.find(r'\chapter{EXPECTED OUTCOMES}')
hw_mod2 = hw_mod1[:ch4_start] + "\n% --- AQMRG TECHNICAL METHODOLOGY ---\n" + block_meth + "\n\n" + hw_mod1[ch4_start:]

# Inject Outcomes block at the end of Chapter 4
ch5_start = hw_mod2.find(r'\chapter{WORK PLAN AND BUDGET}')
hw_mod3 = hw_mod2[:ch5_start] + "\n% --- AQMRG SYSTEM OUTCOMES ---\n" + block_outcomes + "\n\n" + hw_mod2[ch5_start:]

# Inject Conclusion Chapter right after Work Plan and Budget, before Bibliography
bib_start = hw_mod3.find(r'\bibliographystyle{unsrt}')
hw_mod4 = hw_mod3[:bib_start] + "\n" + block_conclusion + "\n\n" + hw_mod3[bib_start:]

# Remove duplicates of package imports in tikz_preamble (handled partially)
# Just to ensure it compiles! We'll test with pdflatex.

with open(out_file, 'w') as f:
    f.write(hw_mod4)

print("Merged document written to", out_file)
