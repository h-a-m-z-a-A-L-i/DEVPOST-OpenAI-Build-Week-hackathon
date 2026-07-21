NOTEBOOK_TOOLS = [
    {"name": "get_active_notebook", "description": "Read the active notebook and its cells.", "parameters": {"type": "object", "properties": {}}},
    {"name": "list_cells", "description": "List the active notebook cells.", "parameters": {"type": "object", "properties": {}}},
    {"name": "read_cell", "description": "Read one active notebook cell by stable cellId or index.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "cellId": {"type": "string"}}}},
    {"name": "read_cell_output", "description": "Read one cell output by stable cellId or index.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "cellId": {"type": "string"}}}},
    {"name": "insert_cell", "description": "Insert a code or markdown cell.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "type": {"type": "string", "enum": ["code", "markdown"]}, "source": {"type": "string"}}, "required": ["source"]}},
    {"name": "edit_cell", "description": "Replace a cell source by stable cellId or index.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "cellId": {"type": "string"}, "source": {"type": "string"}}, "required": ["source"]}},
    {"name": "delete_cell", "description": "Delete one cell by stable cellId or index.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "cellId": {"type": "string"}}}},
    {"name": "run_cell", "description": "Run one cell by stable cellId or index and return its result.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "cellId": {"type": "string"}}}},
]
