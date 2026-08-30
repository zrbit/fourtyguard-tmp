"""Isolated overnight cooling-deficit collection and analysis spike.

Nothing in this package reads or writes the shared ``ml/data`` cache, ledger,
or daytime training dataset.  It is deliberately safe to prepare while another
collector is running; actual API collection has an explicit execution gate.
"""
