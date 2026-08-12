/// A file hanging off a piece of homework, a submission or a class post.
///
/// Shared rather than living in one feature: a teacher's worksheet and a
/// parent's photograph are the same shape, travel through the same endpoint,
/// and are rendered by the same widget.
class AttachedFile {
  AttachedFile({
    required this.id,
    required this.originalName,
    required this.mimeType,
    required this.path,
  });

  factory AttachedFile.fromJson(Map<String, dynamic> json) => AttachedFile(
    id: json['id'] as String,
    originalName: json['originalName'] as String? ?? '',
    mimeType: json['mimeType'] as String? ?? '',
    path: _relative(json['url'] as String? ?? '', json['id'] as String),
  );

  final String id;
  final String originalName;
  final String mimeType;

  /// A path relative to the API client's base URL, not a public link — it
  /// carries no permission of its own and needs the caller's token. That is why
  /// images go through AuthedImage rather than Image.network.
  final String path;

  bool get isImage => mimeType.startsWith('image/');

  /// The API hands out `/api/v1/files/:id`, which is right for the web portal
  /// (rooted at the domain) and wrong for us: the mobile base URL already ends
  /// in `/api/v1`, so passing it through would request
  /// `/api/v1/api/v1/files/:id` and 404 every photograph. Trimmed here, once,
  /// rather than at each call site.
  static String _relative(String url, String id) {
    const prefix = '/api/v1';
    if (url.isEmpty) return '/files/$id';
    if (url.startsWith(prefix)) return url.substring(prefix.length);
    return url;
  }
}
