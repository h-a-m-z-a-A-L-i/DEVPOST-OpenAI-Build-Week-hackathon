from pathlib import Path

from setuptools import setup


root = Path(__file__).parent
extension_name = "notebookpilot-jupyterlab-bridge"
extension_files = [root / "package.json", *sorted((root / "lib").glob("*"))]

setup(
    name=extension_name,
    version="0.1.0",
    description="NotebookPilot JupyterLab frontend bridge.",
    packages=[],
    data_files=[
        (
            f"share/jupyter/labextensions/{extension_name}",
            [str(path.relative_to(root)) for path in extension_files],
        ),
    ],
    include_package_data=True,
)
