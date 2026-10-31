# Text contract

CSV schema: one `review` column; extra columns are ignored. Each review is a string of 3–4,000 characters. Maximum 500 rows / 2 MiB. Tokenization lowercases text, extracts ASCII `[a-z]{2,}` words and adjacent bigrams, then applies the fixed TF-IDF vocabulary, IDF and L2 norm. Unsupported languages and unknown words reduce reliability; zero overlap is explicitly warned. No neutral category exists.
