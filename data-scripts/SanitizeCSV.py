#!/usr/bin/python

import csv
import sys

out = csv.writer(sys.stdout)

for row in csv.reader(sys.stdin):
   new_row = [r.replace("|", "") for r in row]
   print "|".join(new_row)