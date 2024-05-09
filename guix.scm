(use-modules
  (arctype download yarn)
  ((arctype packages babashka) #:select (babashka))
  ((arctype packages yarn) #:select (yarn))
  ((gnu packages databases) #:select (redis))
  ((gnu packages networking) #:select (socat))
  ((gnu packages node) #:select (node-lts))
  ((gnu packages python) #:select (python-3))
  ((gnu packages xorg) #:select (xorg-server))
  (guix build-system gnu)
  (guix gexp)
  ((guix licenses) #:prefix licenses/)
  (guix packages))

(package
  (name "browsertrix-crawler")
  (version "git")
  (source #f)
  (build-system gnu-build-system)
  (inputs
    (list
      node-lts
      python-3
      redis
      socat
      xorg-server
      yarn))
  (native-inputs
    (list
      babashka))
  (synopsis "Browsertrix crawler")
  (description "Browsertrix crawler")
  (home-page "https://github.com/webrecorder/browsertrix-crawler")
  (license licenses/agpl3+))
