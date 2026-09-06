def main():
    """MCP Local Search Server - full-text and semantic search over local documents"""
    import argparse

    from .server import serve

    parser = argparse.ArgumentParser(
        description="give a model the ability to search local documents"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        help="Directory for the index database, extracted text cache, and model cache",
    )

    args = parser.parse_args()
    serve(args.data_dir)


if __name__ == "__main__":
    main()
