import os
import re

base_dir = "/Users/lennoxkk/Documents/AIR QUALITY/aqmrg-api"
hw_tex = os.path.join(base_dir, "Heat_wave/main.tex")
rp_tex = os.path.join(base_dir, "research_proposal.tex")
out_dir = os.path.join(base_dir, "Final_MSc_Proposal/src")
sections_dir = os.path.join(out_dir, "sections")

os.makedirs(sections_dir, exist_ok=True)

with open(hw_tex, "r") as f:
    hw_content = f.read()

with open(rp_tex, "r") as f:
    rp_content = f.read()

# 1. EXTRACT PREAMBLE FROM RP
preamble_match = re.search(r'\\usepackage\[utf8\]\{inputenc\}.*?(?=\\begin\{document\})', rp_content, re.DOTALL)
preamble_content = preamble_match.group(0) if preamble_match else ""
tikz_stuff = []
in_tikz = False
for line in preamble_content.split('\n'):
    if line.startswith(r'\pgfplotsset') or line.startswith(r'\usetikzlibrary') or line.startswith(r'\tikzset') or line.startswith(r'\definecolor'):
        tikz_stuff.append(line)
        in_tikz = True
    elif in_tikz and line.strip() != "" and not line.startswith(r'\usepackage'):
        tikz_stuff.append(line)
    elif in_tikz and line.strip() == "":
        in_tikz = False

tikz_preamble = "\n% --- AQMRG TIKZ SETTINGS ---\n\\usepackage{tikz}\n\\usepackage{pgfplots}\n" + "\n".join(tikz_stuff)

# Create main.tex preamble by injecting into hw_content
begin_doc_pos = hw_content.find(r'\begin{document}')
if begin_doc_pos == -1:
    print("Error finding begin document")
    
# Find the start of chapter 1
chap1_pos = hw_content.find(r'\chapter{INTRODUCTION}')

# Main tex string:
main_tex = hw_content[:begin_doc_pos] + tikz_preamble + "\n\n" + hw_content[begin_doc_pos:chap1_pos]

# Add \input commands
main_tex += r"""
\input{sections/01_introduction}
\input{sections/02_literature_review}
\input{sections/03_methodology}
\input{sections/04_expected_outcomes}
\input{sections/05_workplan_budget}
"""

main_tex += "\n" + hw_content[hw_content.find(r'\bibliographystyle'):]

with open(os.path.join(out_dir, "main.tex"), "w") as f:
    f.write(main_tex)

# 2. EXTRACT CHAPTER 1 (INTRODUCTION)
chap2_pos = hw_content.find(r'\chapter{LITERATURE REVIEW}')
chap1_content = hw_content[chap1_pos:chap2_pos]
with open(os.path.join(sections_dir, "01_introduction.tex"), "w") as f:
    f.write(chap1_content)

# 3. EXTRACT CHAPTER 2 (LIT REVIEW)
chap3_pos = hw_content.find(r'\chapter{METHODOLOGY}')
chap2_content = hw_content[chap2_pos:chap3_pos]
with open(os.path.join(sections_dir, "02_literature_review.tex"), "w") as f:
    f.write(chap2_content)

# 4. EXTRACT CHAPTER 3 AND INJECT RP ARCHITECTURE
chap4_pos = hw_content.find(r'\chapter{EXPECTED OUTCOMES}')
hw_chap3 = hw_content[chap3_pos:chap4_pos]

rp_arch_start = rp_content.find(r'\section{System Architecture Overview}')
rp_results_start = rp_content.find(r'\section{Results and Expected Outcomes}')
rp_arch_content = rp_content[rp_arch_start:rp_results_start]

# Change \section to \section (Wait, in report class \chapter is top level. So \section is correct!)
# Actually in Heat_wave, Chapter 3 has \section{Overview of the Chapter}, \section{Research Design}...
# So appending the \section from research_proposal is perfect.
# But we should change the literal "System Architecture Overview" to be a \section in the file. Wait, they already are \section.

combined_chap3 = hw_chap3 + "\n% --- EXPERIMENTAL SYSTEM ARCHITECTURE (FROM AQMRG) ---\n" + rp_arch_content

with open(os.path.join(sections_dir, "03_methodology.tex"), "w") as f:
    f.write(combined_chap3)

# 5. EXTRACT CHAPTER 4 AND INJECT RP RESULTS
chap5_pos = hw_content.find(r'\chapter{WORK PLAN AND BUDGET}')
hw_chap4 = hw_content[chap4_pos:chap5_pos]

rp_conc_start = rp_content.find(r'\section{Conclusion}')
rp_results_content = rp_content[rp_results_start:rp_conc_start]
rp_results_content = rp_results_content.replace(r'\section{Results and Expected Outcomes}', r'\section{System Performance Validation}')

combined_chap4 = hw_chap4 + "\n% --- SYSTEM ARCHITECTURE PERFORMANCE (FROM AQMRG) ---\n" + rp_results_content

with open(os.path.join(sections_dir, "04_expected_outcomes.tex"), "w") as f:
    f.write(combined_chap4)

# 6. EXTRACT CHAPTER 5 AND CONCLUSION
bib_pos = hw_content.find(r'\bibliographystyle{unsrt}')
hw_chap5 = hw_content[chap5_pos:bib_pos]
rp_conclusion = rp_content[rp_conc_start:rp_content.find(r'\end{document}')]
rp_conclusion = rp_conclusion.replace(r'\section{Conclusion}', r'\section{Final Conclusion Summary}')

combined_chap5 = hw_chap5 + "\n\n" + rp_conclusion

with open(os.path.join(sections_dir, "05_workplan_budget.tex"), "w") as f:
    f.write(combined_chap5)

print("Modular files created successfully.")
