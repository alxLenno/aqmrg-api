# Makefile for Final_MSc_Proposal

PROJECT = main
SRC_DIR = src
OUT_DIR = out

TEX = ~/bin/pdflatex -interaction=nonstopmode -output-directory=../$(OUT_DIR)
BIB = ~/bin/bibtex

.PHONY: all clean

all: $(OUT_DIR)/$(PROJECT).pdf

$(OUT_DIR)/$(PROJECT).pdf: $(SRC_DIR)/*.tex
	cd $(SRC_DIR) && $(TEX) $(PROJECT).tex || true
	cp $(SRC_DIR)/*.bib $(OUT_DIR)/ || true
	cd $(OUT_DIR) && $(BIB) $(PROJECT) || true
	cp $(OUT_DIR)/*.bbl $(SRC_DIR)/ || true
	cd $(SRC_DIR) && $(TEX) $(PROJECT).tex || true
	cd $(SRC_DIR) && $(TEX) $(PROJECT).tex || true

clean:
	rm -rf $(OUT_DIR)/*
