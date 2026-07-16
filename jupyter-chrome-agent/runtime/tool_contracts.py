NOTEBOOK_TOOLS = [
    {"name": "get_active_notebook", "description": "Read the active notebook and its cells.", "parameters": {"type": "object", "properties": {}}},
    {"name": "list_cells", "description": "List the active notebook cells.", "parameters": {"type": "object", "properties": {}}},
    {"name": "read_cell", "description": "Read one active notebook cell.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}}, "required": ["index"]}},
    {"name": "read_cell_output", "description": "Read one cell output.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}}, "required": ["index"]}},
    {"name": "insert_cell", "description": "Insert a code or markdown cell.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "type": {"type": "string", "enum": ["code", "markdown"]}, "source": {"type": "string"}}, "required": ["source"]}},
    {"name": "edit_cell", "description": "Replace a cell source.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}, "source": {"type": "string"}}, "required": ["index", "source"]}},
    {"name": "delete_cell", "description": "Delete one cell.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}}, "required": ["index"]}},
    {"name": "run_cell", "description": "Run one cell and return its result.", "parameters": {"type": "object", "properties": {"index": {"type": "integer", "minimum": 0}}, "required": ["index"]}},
]
