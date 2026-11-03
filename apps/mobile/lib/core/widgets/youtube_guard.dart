import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// YouTube, kept in its place.
///
/// The films and lesson videos are YouTube videos played inside the app, and
/// a preschool app must not become a way into YouTube itself: its
/// recommendations, its search, other people's videos. Google Play's Families
/// policy holds an app for young children to that, and so does a parent.
///
/// Three rules, in one place so every player keeps them:
///
///  * a player may only ever show the embed page of the video it was given —
///    any other page, YouTube's own included, is refused ([embedOnly]);
///  * there is no falling back to the full watch page when the embed will not
///    play;
///  * the way out to the YouTube app, for a film that will not play here, is
///    behind a question a grown-up can answer and a four-year-old cannot
///    ([openInYouTube]).

/// Whether [url] is the embed page of [videoId] and nothing else.
bool isEmbedOf(String url, String videoId) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https') return false;
  const hosts = {'www.youtube.com', 'youtube.com', 'm.youtube.com'};
  return hosts.contains(uri.host) && uri.path == '/embed/$videoId';
}

/// The navigation rule for a player's WebView: its own video's embed page, and
/// nowhere else. Frames inside the page are left alone — the player itself is
/// built from them — so only where the page as a whole goes is decided here.
NavigationDecision embedOnly(NavigationRequest request, String videoId) =>
    !request.isMainFrame || isEmbedOf(request.url, videoId)
    ? NavigationDecision.navigate
    : NavigationDecision.prevent;

/// Opens the video in the YouTube app, once a grown-up has said so.
///
/// For a phone that will not play it here. False when nobody answered, the
/// answer was wrong, or nothing could open YouTube.
Future<bool> openInYouTube(
  BuildContext context,
  String videoId, {
  Random? random,
}) async {
  if (!await confirmGrownUp(context, random: random)) return false;
  try {
    return await launchUrl(
      Uri.parse('https://www.youtube.com/watch?v=$videoId'),
      mode: LaunchMode.externalApplication,
    );
  } on PlatformException {
    return false;
  }
}

/// Asks a sum a grown-up can do in their head and a preschooler cannot: two
/// numbers, the first in its teens. True only for the right answer.
Future<bool> confirmGrownUp(BuildContext context, {Random? random}) async {
  final dice = random ?? Random();
  final first = 11 + dice.nextInt(9);
  final second = 3 + dice.nextInt(7);
  final answer = await showDialog<bool>(
    context: context,
    builder: (_) => _GrownUpCheck(first: first, second: second),
  );
  return answer ?? false;
}

class _GrownUpCheck extends StatefulWidget {
  const _GrownUpCheck({required this.first, required this.second});

  final int first;
  final int second;

  @override
  State<_GrownUpCheck> createState() => _GrownUpCheckState();
}

class _GrownUpCheckState extends State<_GrownUpCheck> {
  final _answer = TextEditingController();
  bool _wrong = false;

  @override
  void dispose() {
    _answer.dispose();
    super.dispose();
  }

  void _check() {
    if (int.tryParse(_answer.text.trim()) == widget.first + widget.second) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _wrong = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('For grown-ups'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'This opens YouTube, outside Poetree Kids. To carry on, what is '
            '${widget.first} + ${widget.second}?',
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _answer,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onSubmitted: (_) => _check(),
            decoration: InputDecoration(
              labelText: 'Answer',
              errorText: _wrong ? 'That is not right. Try again.' : null,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _check, child: const Text('Continue')),
      ],
    );
  }
}
